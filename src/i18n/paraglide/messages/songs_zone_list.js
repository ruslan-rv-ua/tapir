/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Songs_Zone_ListInputs */

const uk_songs_zone_list = /** @type {(inputs: Songs_Zone_ListInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Список записів`)
};

const en_songs_zone_list = /** @type {(inputs: Songs_Zone_ListInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Recordings list`)
};

/**
* | output |
* | --- |
* | "Recordings list" |
*
* @param {Songs_Zone_ListInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_zone_list = /** @type {((inputs?: Songs_Zone_ListInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Zone_ListInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_zone_list(inputs)
	return en_songs_zone_list(inputs)
});