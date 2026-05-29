/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Segment_TechInputs */

const uk_segment_tech = /** @type {(inputs: Segment_TechInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Технічна інформація`)
};

const en_segment_tech = /** @type {(inputs: Segment_TechInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Technical info`)
};

/**
* | output |
* | --- |
* | "Technical info" |
*
* @param {Segment_TechInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const segment_tech = /** @type {((inputs?: Segment_TechInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Segment_TechInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_segment_tech(inputs)
	return en_segment_tech(inputs)
});