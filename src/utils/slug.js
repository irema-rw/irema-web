// ── Slug utilities ──────────────────────────────────────────────────────────
// We use slugs (kebab-case, ASCII) as the canonical URL segment for companies
// (e.g. /business/muhabura-auto-care) instead of Firestore doc IDs. Slugs
// must be unique per collection; on collision we append -2, -3, … until free.
//
// Kept pure/sync-safe except for ensureUniqueSlug which hits Firestore.
// ────────────────────────────────────────────────────────────────────────────

import { db, collection, query, where, getDocs, limit as fbLimit } from '../firebase/config';

/** Normalise a free-form name into a URL-safe slug. */
export function slugify(input) {
  if (!input) return '';
  return String(input)
    .normalize('NFKD')                      // split accents (é -> e + ´)
    .replace(/[\u0300-\u036f]/g, '')        // strip the combining marks
    .toLowerCase()
    .trim()
    .replace(/['’"`]/g, '')                 // drop apostrophes outright
    .replace(/[^a-z0-9]+/g, '-')            // every other non-alnum → dash
    .replace(/^-+|-+$/g, '')                // trim leading/trailing dashes
    .slice(0, 60);                          // hard length cap
}

/**
 * Look up a company document by its slug.
 * Returns { id, ...data } or null.
 * Includes retry logic for potential timing issues.
 */
export async function findCompanyBySlug(slug) {
  if (!slug) return null;

  // Try up to 3 times with exponential backoff to handle replication delays
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const snap = await getDocs(
        query(collection(db, 'companies'), where('slug', '==', slug), fbLimit(1))
      );
      if (!snap.empty) {
        const d = snap.docs[0];
        return { id: d.id, ...d.data() };
      }
    } catch (e) {
      console.warn(`Slug lookup attempt ${attempt} failed:`, e.message);
    }

    // Backoff before retry: 500ms, then 1000ms
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, attempt === 1 ? 500 : 1000));
    }
  }

  return null;
}

/**
 * Check whether a slug is already taken, optionally ignoring a given doc id
 * (useful when re-saving a company's own slug).
 */
export async function slugExists(slug, ignoreId = null) {
  if (!slug) return false;
  const snap = await getDocs(
    query(collection(db, 'companies'), where('slug', '==', slug))
  );
  return snap.docs.some(d => d.id !== ignoreId);
}

/**
 * Produce a unique slug based on `baseName`. If the base slug is already in
 * use, append -2, -3, … until an unused variant is found.
 */
export async function ensureUniqueSlug(baseName, ignoreId = null) {
  const base = slugify(baseName) || 'business';
  let candidate = base;
  let n = 2;
  // Defensive: cap the loop so a pathological Firestore state can't hang us.
  while (n < 1000 && await slugExists(candidate, ignoreId)) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

/**
 * Given a company record, return the best URL segment to use. Prefer the
 * stored slug, fall back to the Firestore id so legacy docs without slugs
 * still resolve (they'll canonicalise to the slug URL on next visit).
 */
export function companyUrlKey(company) {
  if (!company) return '';
  return company.slug || company.id || '';
}

/** Convenience: build the canonical /business/<slug> path for a company. */
export function companyPath(company) {
  const key = companyUrlKey(company);
  return key ? `/business/${key}` : '/';
}
