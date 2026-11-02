type VisitLineItemLike = {
  name: string;
  unitPrice: string | number;
  total: string | number;
};

const INCLUDED_LINE_NAME = /^(?:professional installation|takedown|storage|maintenance|annual color changes|.*warrant(?:y|ies)|.*\bincluded\b)$/i;

/** Identify informational zero-dollar rows copied from an estimate into a visit. */
export function isIncludedVisitLineItem(item: VisitLineItemLike) {
  return (
    Number(item.unitPrice) === 0 &&
    Number(item.total) === 0 &&
    INCLUDED_LINE_NAME.test(item.name.trim())
  );
}
