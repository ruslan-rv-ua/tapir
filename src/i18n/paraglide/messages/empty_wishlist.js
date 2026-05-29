/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Empty_WishlistInputs */

const uk_empty_wishlist = /** @type {(inputs: Empty_WishlistInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Список бажаних треків порожній`)
};

const en_empty_wishlist = /** @type {(inputs: Empty_WishlistInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Wishlist is empty`)
};

/**
* | output |
* | --- |
* | "Wishlist is empty" |
*
* @param {Empty_WishlistInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const empty_wishlist = /** @type {((inputs?: Empty_WishlistInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Empty_WishlistInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_empty_wishlist(inputs)
	return en_empty_wishlist(inputs)
});