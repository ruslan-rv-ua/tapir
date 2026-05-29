/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Wishlist_Tab_LabelInputs */

const uk_wishlist_tab_label = /** @type {(inputs: Wishlist_Tab_LabelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Бажане`)
};

const en_wishlist_tab_label = /** @type {(inputs: Wishlist_Tab_LabelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Wishlist`)
};

/**
* | output |
* | --- |
* | "Wishlist" |
*
* @param {Wishlist_Tab_LabelInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const wishlist_tab_label = /** @type {((inputs?: Wishlist_Tab_LabelInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Wishlist_Tab_LabelInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_wishlist_tab_label(inputs)
	return en_wishlist_tab_label(inputs)
});