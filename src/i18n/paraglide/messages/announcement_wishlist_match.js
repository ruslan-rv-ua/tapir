/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ title: NonNullable<unknown> }} Announcement_Wishlist_MatchInputs */

const uk_announcement_wishlist_match = /** @type {(inputs: Announcement_Wishlist_MatchInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Знайдено бажану пісню: ${i?.title}`)
};

const en_announcement_wishlist_match = /** @type {(inputs: Announcement_Wishlist_MatchInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Desired track found: ${i?.title}`)
};

/**
* | output |
* | --- |
* | "Desired track found: {title}" |
*
* @param {Announcement_Wishlist_MatchInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const announcement_wishlist_match = /** @type {((inputs: Announcement_Wishlist_MatchInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Announcement_Wishlist_MatchInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_announcement_wishlist_match(inputs)
	return en_announcement_wishlist_match(inputs)
});