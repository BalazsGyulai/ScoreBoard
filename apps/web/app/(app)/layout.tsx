// Authenticated app shell.
// Every route inside (app)/ — dashboard, games, players, settings — renders
// inside this layout. Put the sidebar Nav here once it's built.
//
// Currently a transparent pass-through so the routes render without errors.
// Replace the <main> with <Sidebar /> + <main> when Nav.tsx is ready.

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="appShell">
      {/* <Sidebar /> will go here */}
      <main className="appContent">
        {children}
      </main>
    </div>
  );
}
