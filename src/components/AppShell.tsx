import { Link, Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";

export function AppShell() {
  return (
    <div className="app-shell">
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">
        <Link className="app-footer__link" to="/hub">
          Ecosystem hub
        </Link>
        <span className="app-footer__sep" aria-hidden>
          ·
        </span>
        <Link className="app-footer__link" to="/terms">
          Terms of Service
        </Link>
      </footer>
      <BottomNav />
    </div>
  );
}
