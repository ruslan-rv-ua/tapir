/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Browser_Station_AddedInputs */

const uk_browser_station_added = /** @type {(inputs: Browser_Station_AddedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Станцію «${i?.name}» додано`)
};

const en_browser_station_added = /** @type {(inputs: Browser_Station_AddedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Station "${i?.name}" added`)
};

/**
* | output |
* | --- |
* | "Station \"{name}\" added" |
*
* @param {Browser_Station_AddedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const browser_station_added = /** @type {((inputs: Browser_Station_AddedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Browser_Station_AddedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_browser_station_added(inputs)
	return en_browser_station_added(inputs)
});