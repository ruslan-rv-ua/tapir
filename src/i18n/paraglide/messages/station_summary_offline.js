/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Station_Summary_OfflineInputs */

const uk_station_summary_offline = /** @type {(inputs: Station_Summary_OfflineInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Недоступна, ${i?.name}`)
};

const en_station_summary_offline = /** @type {(inputs: Station_Summary_OfflineInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Unavailable, ${i?.name}`)
};

/**
* | output |
* | --- |
* | "Unavailable, {name}" |
*
* @param {Station_Summary_OfflineInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const station_summary_offline = /** @type {((inputs: Station_Summary_OfflineInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Station_Summary_OfflineInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_station_summary_offline(inputs)
	return en_station_summary_offline(inputs)
});