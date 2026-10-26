import { redirect } from 'next/navigation';

// The dashboard is the landing page.
export default function Home() {
  redirect('/dashboard');
}
