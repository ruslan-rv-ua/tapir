/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ pattern: NonNullable<unknown> }} Confirm_Remove_PatternInputs */

const uk_confirm_remove_pattern = /** @type {(inputs: Confirm_Remove_PatternInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Видалити патерн "${i?.pattern}"?`)
};

const en_confirm_remove_pattern = /** @type {(inputs: Confirm_Remove_PatternInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Remove pattern "${i?.pattern}"?`)
};

/**
* | output |
* | --- |
* | "Remove pattern \"{pattern}\"?" |
*
* @param {Confirm_Remove_PatternInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const confirm_remove_pattern = /** @type {((inputs: Confirm_Remove_PatternInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Confirm_Remove_PatternInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_confirm_remove_pattern(inputs)
	return en_confirm_remove_pattern(inputs)
});