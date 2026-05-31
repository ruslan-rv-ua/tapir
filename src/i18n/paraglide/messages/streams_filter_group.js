/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Streams_Filter_GroupInputs */

const uk_streams_filter_group = /** @type {(inputs: Streams_Filter_GroupInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Фільтр потоків`)
};

const en_streams_filter_group = /** @type {(inputs: Streams_Filter_GroupInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Stream filter`)
};

/**
* | output |
* | --- |
* | "Stream filter" |
*
* @param {Streams_Filter_GroupInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const streams_filter_group = /** @type {((inputs?: Streams_Filter_GroupInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Streams_Filter_GroupInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_streams_filter_group(inputs)
	return en_streams_filter_group(inputs)
});