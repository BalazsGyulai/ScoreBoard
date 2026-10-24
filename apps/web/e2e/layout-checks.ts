import { expect, type Page, type TestInfo } from "@playwright/test";

// Layout assertions shared by the mobile specs. Each check runs in the page and
// reports concrete offenders (tag.class + size) so a failure says what to fix.

export const MIN_TAP = 44;

export function isTouchProject(testInfo: TestInfo) {
  const width = testInfo.project.use.viewport?.width ?? 1280;
  return width <= 1024;
}

/** The page must not scroll sideways, and nothing may stick out of the viewport. */
export async function expectNoHorizontalOverflow(page: Page) {
  const result = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const clipsX = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox !== "visible") return true;
      }
      return false;
    };
    const offenders: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || style.position === "fixed") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if ((r.right > vw + 1 || r.left < -1) && !clipsX(el)) {
        offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} [${Math.round(r.left)}..${Math.round(r.right)}]`);
      }
    }
    return {
      vw,
      docScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      offenders: offenders.slice(0, 8),
    };
  });

  expect(result.offenders, `elements outside the ${result.vw}px viewport`).toEqual([]);
  expect(result.docScrollWidth, "document scrolls horizontally").toBeLessThanOrEqual(result.vw);
  expect(result.bodyScrollWidth, "body scrolls horizontally").toBeLessThanOrEqual(result.vw);
}

/** Vertical scrolling must work whenever the content is taller than the screen. */
export async function expectVerticalScroll(page: Page) {
  const r = await page.evaluate(() => {
    const html = getComputedStyle(document.documentElement).overflowY;
    const body = getComputedStyle(document.body).overflowY;
    const tall = document.documentElement.scrollHeight > window.innerHeight + 1;
    window.scrollTo(0, document.documentElement.scrollHeight);
    const scrolled = window.scrollY;
    window.scrollTo(0, 0);
    return { html, body, tall, scrolled };
  });
  expect(r.html, "html overflow-y").not.toBe("hidden");
  expect(r.body, "body overflow-y").not.toBe("hidden");
  if (r.tall) expect(r.scrolled, "page is taller than the viewport but does not scroll").toBeGreaterThan(0);
}

type TableInfo = {
  index: number;
  overflowX: string;
  containerWidth: number;
  containerScrollWidth: number;
  tableWidth: number;
  containerRight: number;
  vw: number;
  stickyFirst: boolean;
};

/**
 * Every table must sit in its own horizontal scroll container (overflow-x auto/scroll —
 * not hidden, which clips it) that fits in the viewport. Tables wider than their
 * container must really scroll with a swipe/wheel, and a sticky first column must stay put.
 * Returns how many tables actually overflowed (were scroll-tested).
 */
export async function expectTablesScrollable(page: Page, { touch }: { touch: boolean }) {
  const tables: TableInfo[] = await page.evaluate(() =>
    Array.from(document.querySelectorAll("table")).map((table, index) => {
      let container: HTMLElement | null = table.parentElement;
      while (container && getComputedStyle(container).overflowX === "visible") container = container.parentElement;
      const c = container ?? document.documentElement;
      c.setAttribute("data-e2e-scroller", String(index));
      const first = table.querySelector("th, td");
      return {
        index,
        overflowX: container ? getComputedStyle(c).overflowX : "none",
        containerWidth: c.clientWidth,
        containerScrollWidth: c.scrollWidth,
        tableWidth: table.getBoundingClientRect().width,
        containerRight: c.getBoundingClientRect().right,
        vw: document.documentElement.clientWidth,
        stickyFirst: !!first && getComputedStyle(first).position === "sticky",
      };
    }),
  );

  let overflowing = 0;
  for (const t of tables) {
    const label = `table #${t.index}`;
    expect(["auto", "scroll"], `${label}: nearest clipping ancestor has overflow-x:${t.overflowX}`).toContain(t.overflowX);
    expect(t.containerRight, `${label}: scroll container wider than viewport`).toBeLessThanOrEqual(t.vw + 1);

    if (t.tableWidth <= t.containerWidth + 1) continue;
    overflowing++;
    expect(t.containerScrollWidth, `${label}: wider than its container but not scrollable`).toBeGreaterThan(t.containerWidth);

    const scroller = page.locator(`[data-e2e-scroller="${t.index}"]`);
    await scroller.scrollIntoViewIfNeeded();
    // keep the gesture point clear of the fixed nav bars
    await page.evaluate((i) => {
      const el = document.querySelector(`[data-e2e-scroller="${i}"]`)!;
      const r = el.getBoundingClientRect();
      window.scrollBy(0, r.top + Math.min(r.height, 120) / 2 - window.innerHeight / 2);
    }, t.index);
    const box = (await scroller.boundingBox())!;
    const y = box.y + Math.min(box.height, 120) / 2;

    await swipeLeft(page, box.x + box.width * 0.8, y, Math.min(200, box.width / 2), touch);

    const after = await scroller.evaluate((el) => {
      const first = el.querySelector("table th, table td")!;
      return {
        scrollLeft: el.scrollLeft,
        firstLeft: first.getBoundingClientRect().left,
        containerLeft: el.getBoundingClientRect().left + el.clientLeft,
      };
    });
    expect(after.scrollLeft, `${label}: did not scroll horizontally on a swipe`).toBeGreaterThan(0);
    if (t.stickyFirst) {
      expect(Math.abs(after.firstLeft - after.containerLeft), `${label}: sticky first column scrolled away`).toBeLessThanOrEqual(2);
    }
    await scroller.evaluate((el) => el.scrollTo({ left: 0 }));
  }
  return overflowing;
}

/**
 * A real input-driven horizontal swipe: touch events on touch projects (what a finger
 * does), a mouse/trackpad scroll gesture on desktop. (CDP's synthesizeScrollGesture
 * ignores touch in headless Chromium, so the touch swipe is dispatched by hand.)
 */
async function swipeLeft(page: Page, x: number, y: number, distance: number, touch: boolean) {
  const cdp = await page.context().newCDPSession(page);
  x = Math.round(x);
  y = Math.round(y);
  if (touch) {
    const steps = 10;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let i = 1; i <= steps; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: Math.round(x - (distance * i) / steps), y }],
      });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await cdp.send("Input.synthesizeScrollGesture", {
      x,
      y,
      xDistance: -Math.round(distance),
      yDistance: 0,
      gestureSourceType: "mouse",
      speed: 1200,
    });
  }
  await page.waitForTimeout(250);
  await cdp.detach();
}

/** Tap targets ≥ 44×44 px (inline text links inside sentences are exempt, as in WCAG 2.5.8). */
export async function expectTapTargets(page: Page, root = "body") {
  const small = await page.evaluate(
    ({ min, root }) => {
      const out: string[] = [];
      const scope = document.querySelector(root) ?? document.body;
      for (const el of Array.from(
        scope.querySelectorAll<HTMLElement>("a[href], button, input:not([type=hidden]), select, textarea, [role=button]"),
      )) {
        const style = getComputedStyle(el);
        if (style.display === "inline" || style.visibility === "hidden" || el.closest("[aria-hidden=true]")) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.width < min - 0.5 || r.height < min - 0.5) {
          const name = el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent?.trim().slice(0, 25) || "";
          out.push(`${el.tagName.toLowerCase()} "${name}" ${Math.round(r.width)}×${Math.round(r.height)}`);
        }
      }
      return out;
    },
    { min: MIN_TAP, root },
  );
  expect(small, "tap targets smaller than 44px").toEqual([]);
}

/** iOS zooms into inputs with font-size < 16px. */
export async function expectNoZoomInputs(page: Page) {
  const small = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("input:not([type=hidden]), select, textarea"))
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => ({ id: el.id || el.getAttribute("placeholder") || el.tagName, size: parseFloat(getComputedStyle(el).fontSize) }))
      .filter((x) => x.size < 16)
      .map((x) => `${x.id}: ${x.size}px`),
  );
  expect(small, "inputs below 16px (iOS zooms on focus)").toEqual([]);
}

/**
 * Nothing in <main> may be hidden under the fixed navigation: with the page scrolled
 * to the top nothing overlaps a top bar, scrolled to the bottom nothing overlaps a bottom bar.
 */
export async function expectNothingUnderFixedNav(page: Page) {
  const nav = page.getByTestId("app-nav");
  if ((await nav.count()) === 0) return;

  const check = (atBottom: boolean) =>
    page.evaluate((atBottom) => {
      window.scrollTo(0, atBottom ? document.documentElement.scrollHeight : 0);
      const bar = document.querySelector('[data-testid="app-nav"] > *')!.getBoundingClientRect();
      const vh = window.innerHeight;
      const isTop = bar.top < vh / 2;
      if (atBottom === isTop) return [];
      const covered: string[] = [];
      for (const el of Array.from(document.querySelectorAll("main *"))) {
        if (el.children.length > 0 && !(el instanceof HTMLButtonElement || el instanceof HTMLInputElement || el instanceof HTMLAnchorElement)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > vh) continue;
        const overlaps = r.left < bar.right && r.right > bar.left && r.top < bar.bottom && r.bottom > bar.top;
        if (overlaps) covered.push(`${el.tagName.toLowerCase()} "${el.textContent?.trim().slice(0, 20)}"`);
      }
      return covered.slice(0, 5);
    }, atBottom);

  expect(await check(false), "content under the top navigation").toEqual([]);
  expect(await check(true), "content under the bottom navigation").toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
}
