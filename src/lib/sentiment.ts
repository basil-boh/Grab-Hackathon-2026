export type Sentiment = "happy" | "angry" | "neutral";

export function ratingToSentiment(rating: number | undefined | null): Sentiment {
  if (typeof rating !== "number" || !Number.isFinite(rating)) return "neutral";
  if (rating >= 4.0) return "happy";
  if (rating <= 2.5) return "angry";
  return "neutral";
}

export function sentimentColorClasses(sentiment: Sentiment): string {
  switch (sentiment) {
    case "happy":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "angry":
      return "bg-red-50 text-red-700 border-red-200";
    case "neutral":
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}
