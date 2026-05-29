/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Segment_StatusInputs */

const uk_segment_status = /** @type {(inputs: Segment_StatusInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Статус потоку`)
};

const en_segment_status = /** @type {(inputs: Segment_StatusInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Stream status`)
};

/**
* | output |
* | --- |
* | "Stream status" |
*
* @param {Segment_StatusInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const segment_status = /** @type {((inputs?: Segment_StatusInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Segment_StatusInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_segment_status(inputs)
	return en_segment_status(inputs)
});