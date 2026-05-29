/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Zone_Wishlist_ListInputs */

const uk_zone_wishlist_list = /** @type {(inputs: Zone_Wishlist_ListInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Список патернів`)
};

const en_zone_wishlist_list = /** @type {(inputs: Zone_Wishlist_ListInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Pattern list`)
};

/**
* | output |
* | --- |
* | "Pattern list" |
*
* @param {Zone_Wishlist_ListInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const zone_wishlist_list = /** @type {((inputs?: Zone_Wishlist_ListInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Zone_Wishlist_ListInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_zone_wishlist_list(inputs)
	return en_zone_wishlist_list(inputs)
});