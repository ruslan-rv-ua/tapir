/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ space: NonNullable<unknown> }} Metric_Free_Space_LowInputs */

const uk_metric_free_space_low = /** @type {(inputs: Metric_Free_Space_LowInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Мало вільного місця: ${i?.space}`)
};

const en_metric_free_space_low = /** @type {(inputs: Metric_Free_Space_LowInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Free space low: ${i?.space}`)
};

/**
* | output |
* | --- |
* | "Free space low: {space}" |
*
* @param {Metric_Free_Space_LowInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const metric_free_space_low = /** @type {((inputs: Metric_Free_Space_LowInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Metric_Free_Space_LowInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_metric_free_space_low(inputs)
	return en_metric_free_space_low(inputs)
});