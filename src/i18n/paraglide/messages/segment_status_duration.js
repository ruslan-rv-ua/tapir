/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Segment_Status_DurationInputs */

const uk_segment_status_duration = /** @type {(inputs: Segment_Status_DurationInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Тривалість запису`)
};

const en_segment_status_duration = /** @type {(inputs: Segment_Status_DurationInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Recording duration`)
};

/**
* | output |
* | --- |
* | "Recording duration" |
*
* @param {Segment_Status_DurationInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const segment_status_duration = /** @type {((inputs?: Segment_Status_DurationInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Segment_Status_DurationInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_segment_status_duration(inputs)
	return en_segment_status_duration(inputs)
});