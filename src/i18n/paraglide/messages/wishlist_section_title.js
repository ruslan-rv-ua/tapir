/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Wishlist_Section_TitleInputs */

const uk_wishlist_section_title = /** @type {(inputs: Wishlist_Section_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Бажані треки`)
};

const en_wishlist_section_title = /** @type {(inputs: Wishlist_Section_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Desired tracks`)
};

/**
* | output |
* | --- |
* | "Desired tracks" |
*
* @param {Wishlist_Section_TitleInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const wishlist_section_title = /** @type {((inputs?: Wishlist_Section_TitleInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Wishlist_Section_TitleInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_wishlist_section_title(inputs)
	return en_wishlist_section_title(inputs)
});