import { Redirect } from 'expo-router';

/** Chat lives on Home. Keep this route so old tab links do not 404. */
export default function ChatScreen() {
  return <Redirect href="/" />;
}
