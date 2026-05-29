/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ pattern: NonNullable<unknown> }} Announcement_Pattern_RemovedInputs */

const uk_announcement_pattern_removed = /** @type {(inputs: Announcement_Pattern_RemovedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Патерн видалено: ${i?.pattern}`)
};

const en_announcement_pattern_removed = /** @type {(inputs: Announcement_Pattern_RemovedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Pattern removed: ${i?.pattern}`)
};

/**
* | output |
* | --- |
* | "Pattern removed: {pattern}" |
*
* @param {Announcement_Pattern_RemovedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const announcement_pattern_removed = /** @type {((inputs: Announcement_Pattern_RemovedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Announcement_Pattern_RemovedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_announcement_pattern_removed(inputs)
	return en_announcement_pattern_removed(inputs)
});