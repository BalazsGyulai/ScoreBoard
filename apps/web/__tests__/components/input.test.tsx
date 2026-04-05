import {render, screen, fireEvent} from "@testing-library/react"
import {describe, it, expect, vi} from "vitest"
import Input from "@/components/ui/input"

describe("Input component", () => {
   // ── Basic rendering ──

  it("renders with label and placeholder", () => {
    render(
      <Input
        id="email"
        title="Email"
        type="text"
        placeholder="you@example.com"
      />
    );

    // Check the label text exists
    expect(screen.getByLabelText("Email")).toBeInTheDocument();

    // Check the placeholder
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
  });

  // ── Controlled value + onChange ──

  it("calls onChange when user types", () => {
    const handleChange = vi.fn(); // vi.fn() = mock function

    render(
      <Input
        id="name"
        title="Name"
        type="text"
        placeholder="Your name"
        value=""
        onChange={handleChange}
      />
    );

    const input = screen.getByLabelText("Name");
    fireEvent.change(input, { target: { value: "John" } });

    expect(handleChange).toHaveBeenCalledOnce();
  });

  // ── Password toggle ──

  it("toggles password visibility when eye icon is clicked", () => {
    render(
      <Input
        id="password"
        title="Password"
        type="password"
        placeholder="Enter password"
      />
    );

    const input = screen.getByLabelText("Password");

    // Initially the type should be "password" (hidden)
    expect(input).toHaveAttribute("type", "password");

    // Find the toggle button by its aria-label
    const toggleBtn = screen.getByRole("button", { name: /jelszó/i });
    fireEvent.click(toggleBtn);

    // After click, type should be "text" (visible)
    expect(input).toHaveAttribute("type", "text");

    // Click again to hide
    fireEvent.click(toggleBtn);
    expect(input).toHaveAttribute("type", "password");
  });

  // ── Non-password fields should NOT show the toggle ──

  it("does not show toggle button for non-password fields", () => {
    render(
      <Input
        id="email"
        title="Email"
        type="text"
        placeholder="you@example.com"
      />
    );

    // queryByRole returns null if not found (vs getByRole which throws)
    const toggleBtn = screen.queryByRole("button");
    expect(toggleBtn).not.toBeInTheDocument();
  });
})