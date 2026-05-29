/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Recording_StartedInputs */

const uk_recording_started = /** @type {(inputs: Recording_StartedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Запис розпочато: ${i?.name}`)
};

const en_recording_started = /** @type {(inputs: Recording_StartedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Recording started: ${i?.name}`)
};

/**
* | output |
* | --- |
* | "Recording started: {name}" |
*
* @param {Recording_StartedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const recording_started = /** @type {((inputs: Recording_StartedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Recording_StartedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_recording_started(inputs)
	return en_recording_started(inputs)
});