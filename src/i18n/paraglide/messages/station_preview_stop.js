/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Station_Preview_StopInputs */

const uk_station_preview_stop = /** @type {(inputs: Station_Preview_StopInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Зупинити ${i?.name}`)
};

const en_station_preview_stop = /** @type {(inputs: Station_Preview_StopInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Stop ${i?.name}`)
};

/**
* | output |
* | --- |
* | "Stop {name}" |
*
* @param {Station_Preview_StopInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const station_preview_stop = /** @type {((inputs: Station_Preview_StopInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Station_Preview_StopInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_station_preview_stop(inputs)
	return en_station_preview_stop(inputs)
});