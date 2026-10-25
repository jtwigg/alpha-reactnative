import { Redirect } from 'expo-router';

/** Chat moved to a Home quick-ask. Keep this route so old tab links don't 404. */
export default function ChatScreen() {
  return <Redirect href="/" />;
}
