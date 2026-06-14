/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Help_Section_WishlistInputs */

const uk_help_section_wishlist = /** @type {(inputs: Help_Section_WishlistInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Вішліст`)
};

const en_help_section_wishlist = /** @type {(inputs: Help_Section_WishlistInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Wishlist`)
};

/**
* | output |
* | --- |
* | "Wishlist" |
*
* @param {Help_Section_WishlistInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const help_section_wishlist = /** @type {((inputs?: Help_Section_WishlistInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Help_Section_WishlistInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_help_section_wishlist(inputs)
	return en_help_section_wishlist(inputs)
});