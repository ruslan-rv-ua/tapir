/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ pattern: NonNullable<unknown> }} Announcement_Pattern_UpdatedInputs */

const uk_announcement_pattern_updated = /** @type {(inputs: Announcement_Pattern_UpdatedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Патерн оновлено: ${i?.pattern}`)
};

const en_announcement_pattern_updated = /** @type {(inputs: Announcement_Pattern_UpdatedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Pattern updated: ${i?.pattern}`)
};

/**
* | output |
* | --- |
* | "Pattern updated: {pattern}" |
*
* @param {Announcement_Pattern_UpdatedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const announcement_pattern_updated = /** @type {((inputs: Announcement_Pattern_UpdatedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Announcement_Pattern_UpdatedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_announcement_pattern_updated(inputs)
	return en_announcement_pattern_updated(inputs)
});