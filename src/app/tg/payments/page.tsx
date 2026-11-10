import { redirect } from 'next/navigation';

export default function TelegramPaymentsPage() {
  redirect('/tg?redirect=/payments');
}

