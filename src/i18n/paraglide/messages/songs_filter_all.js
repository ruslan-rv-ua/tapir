/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Songs_Filter_AllInputs */

const uk_songs_filter_all = /** @type {(inputs: Songs_Filter_AllInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Усі станції`)
};

const en_songs_filter_all = /** @type {(inputs: Songs_Filter_AllInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`All stations`)
};

/**
* | output |
* | --- |
* | "All stations" |
*
* @param {Songs_Filter_AllInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_filter_all = /** @type {((inputs?: Songs_Filter_AllInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Filter_AllInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_filter_all(inputs)
	return en_songs_filter_all(inputs)
});