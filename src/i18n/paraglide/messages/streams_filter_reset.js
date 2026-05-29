/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Streams_Filter_ResetInputs */

const uk_streams_filter_reset = /** @type {(inputs: Streams_Filter_ResetInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Скинути фільтр`)
};

const en_streams_filter_reset = /** @type {(inputs: Streams_Filter_ResetInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Reset filter`)
};

/**
* | output |
* | --- |
* | "Reset filter" |
*
* @param {Streams_Filter_ResetInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const streams_filter_reset = /** @type {((inputs?: Streams_Filter_ResetInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Streams_Filter_ResetInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_streams_filter_reset(inputs)
	return en_streams_filter_reset(inputs)
});