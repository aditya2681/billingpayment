export function formatCurrency(amountPaise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amountPaise / 100);
}

export function toPaise(value: string) {
  return Math.round(Number.parseFloat(value || "0") * 100);
}

export function fromPaise(value: number) {
  return (value / 100).toFixed(2);
}

export function formatDateLabel(value: string) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
