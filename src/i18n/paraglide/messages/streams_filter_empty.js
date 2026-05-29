/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Streams_Filter_EmptyInputs */

const uk_streams_filter_empty = /** @type {(inputs: Streams_Filter_EmptyInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Немає потоків, що відповідають фільтру`)
};

const en_streams_filter_empty = /** @type {(inputs: Streams_Filter_EmptyInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`No streams match the filter`)
};

/**
* | output |
* | --- |
* | "No streams match the filter" |
*
* @param {Streams_Filter_EmptyInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const streams_filter_empty = /** @type {((inputs?: Streams_Filter_EmptyInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Streams_Filter_EmptyInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_streams_filter_empty(inputs)
	return en_streams_filter_empty(inputs)
});