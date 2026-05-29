/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Metric_Free_Space_UnavailableInputs */

const uk_metric_free_space_unavailable = /** @type {(inputs: Metric_Free_Space_UnavailableInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Вільне місце: недоступно`)
};

const en_metric_free_space_unavailable = /** @type {(inputs: Metric_Free_Space_UnavailableInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Free space: not available`)
};

/**
* | output |
* | --- |
* | "Free space: not available" |
*
* @param {Metric_Free_Space_UnavailableInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const metric_free_space_unavailable = /** @type {((inputs?: Metric_Free_Space_UnavailableInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Metric_Free_Space_UnavailableInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_metric_free_space_unavailable(inputs)
	return en_metric_free_space_unavailable(inputs)
});