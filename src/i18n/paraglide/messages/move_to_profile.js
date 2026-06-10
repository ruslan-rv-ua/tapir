/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Move_To_ProfileInputs */

const uk_move_to_profile = /** @type {(inputs: Move_To_ProfileInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Перемістити в профіль…`)
};

const en_move_to_profile = /** @type {(inputs: Move_To_ProfileInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Move to profile…`)
};

/**
* | output |
* | --- |
* | "Move to profile…" |
*
* @param {Move_To_ProfileInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const move_to_profile = /** @type {((inputs?: Move_To_ProfileInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Move_To_ProfileInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_move_to_profile(inputs)
	return en_move_to_profile(inputs)
});