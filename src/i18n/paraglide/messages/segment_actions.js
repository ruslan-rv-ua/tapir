/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Segment_ActionsInputs */

const uk_segment_actions = /** @type {(inputs: Segment_ActionsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Дії`)
};

const en_segment_actions = /** @type {(inputs: Segment_ActionsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Actions`)
};

/**
* | output |
* | --- |
* | "Actions" |
*
* @param {Segment_ActionsInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const segment_actions = /** @type {((inputs?: Segment_ActionsInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Segment_ActionsInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_segment_actions(inputs)
	return en_segment_actions(inputs)
});