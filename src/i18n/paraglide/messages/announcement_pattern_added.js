/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ pattern: NonNullable<unknown> }} Announcement_Pattern_AddedInputs */

const uk_announcement_pattern_added = /** @type {(inputs: Announcement_Pattern_AddedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Патерн додано: ${i?.pattern}`)
};

const en_announcement_pattern_added = /** @type {(inputs: Announcement_Pattern_AddedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Pattern added: ${i?.pattern}`)
};

/**
* | output |
* | --- |
* | "Pattern added: {pattern}" |
*
* @param {Announcement_Pattern_AddedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const announcement_pattern_added = /** @type {((inputs: Announcement_Pattern_AddedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Announcement_Pattern_AddedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_announcement_pattern_added(inputs)
	return en_announcement_pattern_added(inputs)
});