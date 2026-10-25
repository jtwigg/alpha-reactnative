import { LinkNotFound } from '@/components/link-not-found';

export default function NotFoundScreen() {
  return (
    <LinkNotFound
      title="Page not found"
      body="That link does not match a screen in Alpha."
      href="/"
      label="Go home"
    />
  );
}
