/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Wishlist_Empty_DescriptionInputs */

const uk_wishlist_empty_description = /** @type {(inputs: Wishlist_Empty_DescriptionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Список порожній. Натисніть Enter, щоб додати перший патерн.`)
};

const en_wishlist_empty_description = /** @type {(inputs: Wishlist_Empty_DescriptionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Empty list. Press Enter to add the first pattern.`)
};

/**
* | output |
* | --- |
* | "Empty list. Press Enter to add the first pattern." |
*
* @param {Wishlist_Empty_DescriptionInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const wishlist_empty_description = /** @type {((inputs?: Wishlist_Empty_DescriptionInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Wishlist_Empty_DescriptionInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_wishlist_empty_description(inputs)
	return en_wishlist_empty_description(inputs)
});