const styles = {
  diproses: 'border-orange-200 bg-orange-50 text-orange-700',
  dikirim: 'border-blue-200 bg-blue-50 text-blue-700',
  selesai: 'border-green-200 bg-green-50 text-green-700',
  retur: 'border-red-200 bg-red-50 text-red-700',
};

export default function OrderStatusBadge({ status }) {
  const c = styles[status] || 'border-slate-200 bg-slate-100 text-slate-600';
  return (
    <span
      className={`inline-block rounded-md border px-2 py-0.5 text-[0.72rem] font-semibold capitalize ${c}`}
    >
      {status}
    </span>
  );
}
