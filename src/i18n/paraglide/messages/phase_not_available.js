/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ phase: NonNullable<unknown> }} Phase_Not_AvailableInputs */

const uk_phase_not_available = /** @type {(inputs: Phase_Not_AvailableInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Буде доступно у Фазі ${i?.phase}`)
};

const en_phase_not_available = /** @type {(inputs: Phase_Not_AvailableInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Available in Phase ${i?.phase}`)
};

/**
* | output |
* | --- |
* | "Available in Phase {phase}" |
*
* @param {Phase_Not_AvailableInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const phase_not_available = /** @type {((inputs: Phase_Not_AvailableInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Phase_Not_AvailableInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_phase_not_available(inputs)
	return en_phase_not_available(inputs)
});