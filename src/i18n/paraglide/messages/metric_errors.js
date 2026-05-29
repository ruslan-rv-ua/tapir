/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Metric_ErrorsInputs */

const uk_metric_errors = /** @type {(inputs: Metric_ErrorsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Потребує уваги`)
};

const en_metric_errors = /** @type {(inputs: Metric_ErrorsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Needs attention`)
};

/**
* | output |
* | --- |
* | "Needs attention" |
*
* @param {Metric_ErrorsInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const metric_errors = /** @type {((inputs?: Metric_ErrorsInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Metric_ErrorsInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_metric_errors(inputs)
	return en_metric_errors(inputs)
});