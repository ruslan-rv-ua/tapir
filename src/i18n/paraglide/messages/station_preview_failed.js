/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Station_Preview_FailedInputs */

const uk_station_preview_failed = /** @type {(inputs: Station_Preview_FailedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Не вдалося підключитися до ${i?.name}`)
};

const en_station_preview_failed = /** @type {(inputs: Station_Preview_FailedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Could not connect to ${i?.name}`)
};

/**
* | output |
* | --- |
* | "Could not connect to {name}" |
*
* @param {Station_Preview_FailedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const station_preview_failed = /** @type {((inputs: Station_Preview_FailedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Station_Preview_FailedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_station_preview_failed(inputs)
	return en_station_preview_failed(inputs)
});