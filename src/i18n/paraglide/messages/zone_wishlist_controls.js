/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Zone_Wishlist_ControlsInputs */

const uk_zone_wishlist_controls = /** @type {(inputs: Zone_Wishlist_ControlsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Список і дії`)
};

const en_zone_wishlist_controls = /** @type {(inputs: Zone_Wishlist_ControlsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`List and actions`)
};

/**
* | output |
* | --- |
* | "List and actions" |
*
* @param {Zone_Wishlist_ControlsInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const zone_wishlist_controls = /** @type {((inputs?: Zone_Wishlist_ControlsInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Zone_Wishlist_ControlsInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_zone_wishlist_controls(inputs)
	return en_zone_wishlist_controls(inputs)
});