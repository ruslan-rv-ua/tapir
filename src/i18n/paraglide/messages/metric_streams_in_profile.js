/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Metric_Streams_In_ProfileInputs */

const uk_metric_streams_in_profile = /** @type {(inputs: Metric_Streams_In_ProfileInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`У профілі`)
};

const en_metric_streams_in_profile = /** @type {(inputs: Metric_Streams_In_ProfileInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`In profile`)
};

/**
* | output |
* | --- |
* | "In profile" |
*
* @param {Metric_Streams_In_ProfileInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const metric_streams_in_profile = /** @type {((inputs?: Metric_Streams_In_ProfileInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Metric_Streams_In_ProfileInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_metric_streams_in_profile(inputs)
	return en_metric_streams_in_profile(inputs)
});