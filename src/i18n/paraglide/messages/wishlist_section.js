/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Wishlist_SectionInputs */

const uk_wishlist_section = /** @type {(inputs: Wishlist_SectionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Вішліст`)
};

const en_wishlist_section = /** @type {(inputs: Wishlist_SectionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Wishlist`)
};

/**
* | output |
* | --- |
* | "Wishlist" |
*
* @param {Wishlist_SectionInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const wishlist_section = /** @type {((inputs?: Wishlist_SectionInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Wishlist_SectionInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_wishlist_section(inputs)
	return en_wishlist_section(inputs)
});