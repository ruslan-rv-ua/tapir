/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Add_To_WishlistInputs */

const uk_add_to_wishlist = /** @type {(inputs: Add_To_WishlistInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Додати до бажаних`)
};

const en_add_to_wishlist = /** @type {(inputs: Add_To_WishlistInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Add to wishlist`)
};

/**
* | output |
* | --- |
* | "Add to wishlist" |
*
* @param {Add_To_WishlistInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const add_to_wishlist = /** @type {((inputs?: Add_To_WishlistInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Add_To_WishlistInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_add_to_wishlist(inputs)
	return en_add_to_wishlist(inputs)
});