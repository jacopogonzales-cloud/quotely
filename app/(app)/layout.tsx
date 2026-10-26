import { NavRail } from '@/components/shell/nav-rail';
import { TopBar } from '@/components/shell/top-bar';

// The app shell: 72px icon rail on the left, 64px top bar, page content below.
export default function AppLayout({ children }: LayoutProps<'/'>) {
  // Only whether credentials exist reaches the browser, never their values.
  const paypalConfigured = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET);

  return (
    <div className="flex h-dvh min-w-[1280px] bg-base text-fg">
      <NavRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar paypalConfigured={paypalConfigured} />
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
