/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Songs_Zone_FilterInputs */

const uk_songs_zone_filter = /** @type {(inputs: Songs_Zone_FilterInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Фільтр записів`)
};

const en_songs_zone_filter = /** @type {(inputs: Songs_Zone_FilterInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Recordings filter`)
};

/**
* | output |
* | --- |
* | "Recordings filter" |
*
* @param {Songs_Zone_FilterInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_zone_filter = /** @type {((inputs?: Songs_Zone_FilterInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Zone_FilterInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_zone_filter(inputs)
	return en_songs_zone_filter(inputs)
});