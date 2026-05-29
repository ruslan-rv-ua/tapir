/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Stop_Recording_NamedInputs */

const uk_stop_recording_named = /** @type {(inputs: Stop_Recording_NamedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Зупинити запис: ${i?.name}`)
};

const en_stop_recording_named = /** @type {(inputs: Stop_Recording_NamedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Stop recording: ${i?.name}`)
};

/**
* | output |
* | --- |
* | "Stop recording: {name}" |
*
* @param {Stop_Recording_NamedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const stop_recording_named = /** @type {((inputs: Stop_Recording_NamedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Stop_Recording_NamedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_stop_recording_named(inputs)
	return en_stop_recording_named(inputs)
});