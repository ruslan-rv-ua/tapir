/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Segment_ConditionsInputs */

const uk_segment_conditions = /** @type {(inputs: Segment_ConditionsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Умови`)
};

const en_segment_conditions = /** @type {(inputs: Segment_ConditionsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Conditions`)
};

/**
* | output |
* | --- |
* | "Conditions" |
*
* @param {Segment_ConditionsInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const segment_conditions = /** @type {((inputs?: Segment_ConditionsInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Segment_ConditionsInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_segment_conditions(inputs)
	return en_segment_conditions(inputs)
});