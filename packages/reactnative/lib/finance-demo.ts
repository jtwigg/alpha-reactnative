import { useLocalSearchParams } from 'expo-router';

export function isFinanceDemoFlag(): boolean {
  return process.env.EXPO_PUBLIC_FINANCE_DEMO === '1';
}

export function useFinanceDemo(): boolean {
  const params = useLocalSearchParams<{ demo?: string }>();
  return isFinanceDemoFlag() || params.demo === '1';
}
