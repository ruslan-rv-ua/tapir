/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Browser_Add_StationInputs */

const uk_browser_add_station = /** @type {(inputs: Browser_Add_StationInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Додати ${i?.name}`)
};

const en_browser_add_station = /** @type {(inputs: Browser_Add_StationInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Add ${i?.name}`)
};

/**
* | output |
* | --- |
* | "Add {name}" |
*
* @param {Browser_Add_StationInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const browser_add_station = /** @type {((inputs: Browser_Add_StationInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Browser_Add_StationInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_browser_add_station(inputs)
	return en_browser_add_station(inputs)
});