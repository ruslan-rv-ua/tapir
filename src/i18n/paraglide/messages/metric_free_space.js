/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Metric_Free_SpaceInputs */

const uk_metric_free_space = /** @type {(inputs: Metric_Free_SpaceInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Вільно`)
};

const en_metric_free_space = /** @type {(inputs: Metric_Free_SpaceInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Free space`)
};

/**
* | output |
* | --- |
* | "Free space" |
*
* @param {Metric_Free_SpaceInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const metric_free_space = /** @type {((inputs?: Metric_Free_SpaceInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Metric_Free_SpaceInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_metric_free_space(inputs)
	return en_metric_free_space(inputs)
});